import email.utils
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

CACHE_TTL = 7200  # 2 hours

_cache: dict = {"items": [], "fetched_at": 0.0}

FEEDS = [
    {"url": "https://www.textileworld.com/feed/", "source": "Textile World"},
    {"url": "https://techcrunch.com/tag/fashion-tech/feed/", "source": "TechCrunch"},
    {"url": "https://textiletoday.com.bd/feed/", "source": "Textile Today"},
]


def _parse_date(date_str: str) -> str:
    try:
        dt = email.utils.parsedate_to_datetime(date_str)
        return dt.strftime("%b %d, %Y")
    except Exception:
        return ""


def _fetch_feed(url: str, source: str, max_items: int = 3) -> list[dict]:
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Filaminto/1.0 (news aggregator)"},
        )
        with urllib.request.urlopen(req, timeout=6) as response:
            content = response.read()

        root = ET.fromstring(content)
        items = []
        for item in root.findall(".//item")[:max_items]:
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            pub_date = _parse_date((item.findtext("pubDate") or "").strip())
            if title:
                items.append({
                    "title": title,
                    "link": link,
                    "pub_date": pub_date,
                    "source": source,
                })
        return items
    except Exception:
        return []


def get_news_feed() -> list[dict]:
    now = time.time()
    if _cache["items"] and (now - _cache["fetched_at"]) < CACHE_TTL:
        return _cache["items"]

    fresh: list[dict] = []
    for feed in FEEDS:
        fresh.extend(_fetch_feed(feed["url"], feed["source"]))

    if fresh:
        _cache["items"] = fresh
        _cache["fetched_at"] = now

    return _cache["items"]
