import asyncio
import json
import logging
from datetime import datetime, timezone

import httpx

from app.utils.string.string_utils import is_empty_string
from app.core.database import Database
from app.core.cache import InMemoryCache
from app.classes.work.status import COMPLETE_STATUSES
from app.classes.work.work import DOC_DETAIL_FIELDS, DocumentDetail, TaskDetail, TASK_DETAIL_FIELDS
from app.classes.work.type import TaskType
from app.classes.work.team import TEAM_MEMBERS

INCOMPLETE_TASKS_CACHE_TTL = 3600  # 1 hour

TASK_COLLECTION_NAME = "tasks"

LINK_URL = "https://link.orangelogic.com"

LINK_SEARCH_API_URL = f"{LINK_URL}/API/Search/v4.0/Search"
COUNT_PER_PAGE = 300



class WorkService:
    _instance = None
    logger = logging.getLogger("uvicorn.error")

    def __new__(cls, *args, **kwargs):
        if not hasattr(cls, "_instance") or cls._instance is None:
            cls._instance = super(WorkService, cls).__new__(cls)
        return cls._instance

    # -------------------------------------------------------------------------
    # Public methods
    # -------------------------------------------------------------------------

    async def get_task_detail(
        self, task_id: str, force_refresh: bool = False, link_auth_token: str | None = None
    ) -> TaskDetail | None:
        db = Database()

        if not force_refresh:
            docs = await db.find_documents_by_field(TASK_COLLECTION_NAME, "identifier", task_id)
            if docs:
                return TaskDetail(**docs[0])

        task_detail = await self._fetch_task_from_api(task_id, link_auth_token)
        if task_detail is None:
            return None

        await self._upsert_task(task_detail)
        return task_detail

    async def get_descendants_tasks(
        self, task_id: str, force_refresh: bool = False, link_auth_token: str | None = None
    ) -> list[TaskDetail]:
        if not force_refresh:
            descendants = await self._get_descendants_from_db(task_id)
            if descendants:
                return descendants

        return await self._fetch_and_store_descendants(task_id, link_auth_token)

    async def get_incomplete_tasks_assigned_to(
        self,
        assignee: str,
        subtypes: list[TaskType] = [],
        force_refresh: bool = False,
        link_auth_token: str | None = None,
    ) -> list[TaskDetail] | None:
        cache = InMemoryCache()
        types_to_fetch = list(TaskType) if not subtypes else subtypes

        if not force_refresh:
            cached_lists: list[list[TaskDetail]] = []
            all_hit = True
            for t in types_to_fetch:
                key = self._cache_key_incomplete_tasks_assigned_to(assignee, t.value)
                raw = await cache.get(key)
                if raw is not None:
                    cached_lists.append([TaskDetail(**x) for x in json.loads(raw)])
                else:
                    all_hit = False
                    break

            if all_hit:
                seen: set[str] = set()
                merged: list[TaskDetail] = []
                for lst in cached_lists:
                    for task in lst:
                        if task.identifier not in seen:
                            seen.add(task.identifier)
                            merged.append(task)
                return merged

        query = f"participant(\"Assigned to\"):(\"{assignee}\") AND NOT (WorkflowStatus:({' OR '.join(COMPLETE_STATUSES)}))"
        if subtypes:
            string_subtypes = [f"\"{s.value}\"" for s in subtypes]
            query += f" AND DocSubType:({' OR '.join(string_subtypes)})"

        results = await self._query_tasks_from_api(query, link_auth_token)
        if not results:
            for t in types_to_fetch:
                await cache.set(
                    self._cache_key_incomplete_tasks_assigned_to(assignee, t.value),
                    "[]",
                    expiration=INCOMPLETE_TASKS_CACHE_TTL,
                )
            return None

        by_type: dict[str, list[TaskDetail]] = {t.value: [] for t in types_to_fetch}
        for task in results:
            type_val = (task.doc_sub_type or "other").lower().strip()
            if type_val in by_type:
                by_type[type_val].append(task)
            else:
                by_type.setdefault("other", []).append(task)

        for type_val, tasks in by_type.items():
            key = self._cache_key_incomplete_tasks_assigned_to(assignee, type_val)
            await cache.set(
                key,
                json.dumps([t.model_dump(mode="json") for t in tasks]),
                expiration=INCOMPLETE_TASKS_CACHE_TTL,
            )

        for task in results:
            await self._upsert_task(task)

        return results

    async def get_completed_tasks_assigned_to(
        self,
        assignee: str,
        subtypes: list[TaskType] = [],
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        force_refresh: bool = False,
        link_auth_token: str | None = None,
    ) -> list[TaskDetail] | None:
        db = Database()

        if not force_refresh:
            filters: dict = {"assigned_to": assignee}
            filters["status"] = {"$in": [s.value for s in COMPLETE_STATUSES]}
            if start_date is not None or end_date is not None:
                date_cond: dict = {}
                if start_date is not None:
                    date_cond["$gte"] = start_date
                if end_date is not None:
                    date_cond["$lte"] = end_date
                filters["completion_date"] = date_cond
            if subtypes:
                filters["doc_sub_type"] = {"$in": [s.value for s in subtypes]}

            docs = await db.find_documents_with_filters(
                TASK_COLLECTION_NAME,
                filters,
                collation={"locale": "en", "strength": 2},
            )
            if docs:
                results: list[TaskDetail] = []
                for doc in docs:
                    doc.pop("updated_at", None)
                    doc.pop("created_at", None)
                    results.append(TaskDetail(**doc))
                return results
            return []

        query = f'participant("Assigned to"):("{assignee}") AND WorkflowStatus:({" OR ".join(COMPLETE_STATUSES)})'
        if subtypes:
            string_subtypes = [f'"{s.value}"' for s in subtypes]
            query += f' AND DocSubType:({" OR ".join(string_subtypes)})'
        if start_date is not None:
            start_iso = start_date.strftime("%Y-%m-%d")
            query += f" AND Completiondate>:{start_iso}"
        if end_date is not None:
            end_iso = end_date.strftime("%Y-%m-%d")
            query += f" AND Completiondate<:{end_iso}"

        results = await self._query_tasks_from_api(query, link_auth_token) or []
        if not results:
            return []

        for task in results:
            await self._upsert_task(task)

        return results

    async def get_emergency_stream(
        self, assignee: str, link_auth_token: str | None = None
    ) -> DocumentDetail | None:
        query = f'DocSubType:Stream AND Title:"{assignee} Emergency"'
        results = await self._query_docs_from_api(query, link_auth_token)
        if results is not None and len(results) == 1:
            return results[0]

        first_name = assignee.split(" ")[0]
        query = f'DocSubType:Stream AND Title:"{first_name} Emergency"'
        results = await self._query_docs_from_api(query, link_auth_token)
        if results is not None and len(results) == 1:
            return results[0]

        return None

    async def get_emergency_incomplete_tasks(
        self, assignee: str, link_auth_token: str | None = None
    ) -> list[TaskDetail] | None:
        stream = await self.get_emergency_stream(assignee, link_auth_token)
        if stream is None:
            return None
        if is_empty_string(stream.identifier):
            return None

        query = f'ParentAlbumIdentifier:{stream.identifier} AND NOT (WorkflowStatus:({" OR ".join(COMPLETE_STATUSES)}))'
        results = await self._query_tasks_from_api(query, link_auth_token)
        if results is not None:
            return results
        return None

    async def get_team_workload(
        self,
        subtypes: list[TaskType] = [],
        force_refresh: bool = False,
        link_auth_token: str | None = None,
    ) -> list[dict]:
        async def fetch_member(name: str) -> dict:
            tasks = (
                await self.get_incomplete_tasks_assigned_to(
                    name,
                    subtypes=subtypes,
                    force_refresh=force_refresh,
                    link_auth_token=link_auth_token,
                )
                or []
            )
            return {
                "name": name,
                "tasks": [t.model_dump() for t in tasks],
            }

        results = await asyncio.gather(*(fetch_member(name) for name in TEAM_MEMBERS))
        return sorted(results, key=lambda r: sum(t["time_left_mn"] for t in r["tasks"]), reverse=True)

    async def get_team_completed_workload(
        self,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        subtypes: list[TaskType] = [],
        force_refresh: bool = False,
        link_auth_token: str | None = None,
    ) -> list[dict]:
        async def fetch_member(name: str) -> dict:
            tasks = (
                await self.get_completed_tasks_assigned_to(
                    name,
                    subtypes=subtypes,
                    start_date=start_date,
                    end_date=end_date,
                    force_refresh=force_refresh,
                    link_auth_token=link_auth_token,
                )
                or []
            )
            return {
                "name": name,
                "tasks": [t.model_dump() for t in tasks],
            }

        results = await asyncio.gather(*(fetch_member(name) for name in TEAM_MEMBERS))
        return sorted(results, key=lambda r: len(r["tasks"]), reverse=True)

    async def get_team_emergency(self, link_auth_token: str | None = None) -> list[dict]:
        async def fetch_member(name: str) -> dict | None:
            tasks = await self.get_emergency_incomplete_tasks(name, link_auth_token)
            if tasks is None:
                return None
            return {
                "name": name,
                "tasks": [t.model_dump() for t in tasks],
            }

        results = await asyncio.gather(*(fetch_member(name) for name in TEAM_MEMBERS))
        return [r for r in results if r is not None]

    async def get_monitored_tasks(self) -> list[TaskDetail]:
        db = Database()
        docs = await db.find_documents_by_field(TASK_COLLECTION_NAME, "monitor", True)
        return [TaskDetail(**doc) for doc in docs]

    async def set_task_monitor(self, task_id: str, monitor: bool) -> bool:
        db = Database()
        existing = await db.find_documents_by_field(TASK_COLLECTION_NAME, "identifier", task_id)
        if not existing:
            return False
        await db.update_document_by_identifier(TASK_COLLECTION_NAME, task_id, {"monitor": monitor})
        return True

    # -------------------------------------------------------------------------
    # Private methods
    # -------------------------------------------------------------------------

    def _cache_key_incomplete_tasks_assigned_to(self, assignee: str, subtype: str) -> str:
        return f"work:incomplete:{assignee.lower()}:{subtype}"

    async def _get_descendants_from_db(self, task_id: str) -> list[TaskDetail]:
        db = Database()
        descendants: list[TaskDetail] = []

        children_docs = await db.find_documents_by_field(
            TASK_COLLECTION_NAME, "parent_folder_identifier", task_id
        )

        for doc in children_docs:
            task = TaskDetail(**doc)
            descendants.append(task)
            child_descendants = await self._get_descendants_from_db(task.identifier)
            descendants.extend(child_descendants)

        return descendants

    async def _fetch_and_store_descendants(
        self, task_id: str, link_auth_token: str | None = None
    ) -> list[TaskDetail]:
        descendants = await self._fetch_descendants_tasks_from_api(task_id, link_auth_token)
        if not descendants:
            return []

        for task in descendants:
            await self._upsert_task(task)

        return descendants

    async def _upsert_task(self, task: TaskDetail) -> None:
        db = Database()
        document = task.model_dump()
        document["updated_at"] = datetime.now(timezone.utc).isoformat()
        existing = await db.find_documents_by_field(TASK_COLLECTION_NAME, "identifier", task.identifier)
        if existing:
            document["monitor"] = existing[0].get("monitor", False)
            await db.update_document_by_identifier(TASK_COLLECTION_NAME, task.identifier, document)
        else:
            document["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.insert_document(TASK_COLLECTION_NAME, document)

    async def _query_docs_from_api(
        self, query: str, link_auth_token: str | None = None
    ) -> list[DocumentDetail] | None:
        if not link_auth_token:
            self.logger.error("Link API: no auth token provided, request aborted")
            return None

        params = {
            "query": query,
            "fields": DOC_DETAIL_FIELDS,
            "format": "JSON",
            "token": link_auth_token,
            "countperpage": COUNT_PER_PAGE,
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(LINK_SEARCH_API_URL, params=params)
                response.raise_for_status()
                data = response.json()
                api_response = data.get("APIResponse", {})
                items = api_response.get("Items", [])
                return [DocumentDetail.from_api_response(item) for item in items]
        except httpx.HTTPStatusError as e:
            self.logger.error(f"Link API returned {e.response.status_code} for query {query}: {e.response.text}")
            return None
        except httpx.RequestError as e:
            self.logger.error(f"Failed to reach Link API for query {query}: {e}")
            return None

    async def _query_tasks_from_api(
        self, query: str, link_auth_token: str | None = None
    ) -> list[TaskDetail] | None:
        if not link_auth_token:
            self.logger.error("Link API: no auth token provided, request aborted")
            return None

        params = {
            "query": f"({query}) AND DocType:Project",
            "fields": TASK_DETAIL_FIELDS,
            "format": "JSON",
            "token": link_auth_token,
            "countperpage": COUNT_PER_PAGE,
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                all_items: list[TaskDetail] = []
                page = 1

                while True:
                    params["pagenumber"] = page
                    response = await client.get(LINK_SEARCH_API_URL, params=params)
                    response.raise_for_status()
                    data = response.json()
                    api_response = data.get("APIResponse", {})
                    items = api_response.get("Items", [])
                    all_items.extend(TaskDetail.from_api_response(item) for item in items)

                    next_page = api_response.get("GlobalInfo", {}).get("NextPage")
                    if not next_page or len(items) < COUNT_PER_PAGE:
                        break
                    page += 1

                return all_items
        except httpx.HTTPStatusError as e:
            self.logger.error(f"Link API returned {e.response.status_code} for query {query}: {e.response.text}")
            return None
        except httpx.RequestError as e:
            self.logger.error(f"Failed to reach Link API for query {query}: {e}")
            return None

    async def _fetch_task_from_api(
        self, task_id: str, link_auth_token: str | None = None
    ) -> TaskDetail | None:
        task_id = self._add_prefix_to_task_id_if_needed(task_id)

        results = await self._query_tasks_from_api(
            f"SystemIdentifier:{task_id}", link_auth_token
        )
        if not results:
            return None
        return results[0] if len(results) > 0 else None

    async def _fetch_descendants_tasks_from_api(
        self, task_id: str, link_auth_token: str | None = None
    ) -> list[TaskDetail] | None:
        task_id = self._add_prefix_to_task_id_if_needed(task_id)
        
        results = await self._query_tasks_from_api(
            f"ParentFolderIdentifier:{task_id}", link_auth_token
        )
        if not results:
            return None
        return results

    def _add_prefix_to_task_id_if_needed(self, task_id: str) -> str:
        if len(task_id) == 6:
            self.logger.warning(f"Task ID {task_id} is too short, adding 'L-' prefix")
            return f"L-{task_id}"
        return task_id