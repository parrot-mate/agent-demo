from __future__ import annotations

import os
from agent_setup import build_agent

from dotenv import load_dotenv
import httpx
from openai import AsyncOpenAI
from agents import Runner, set_default_openai_client, set_tracing_disabled


def main() -> None:
    load_dotenv()
    proxy_enabled = os.getenv("PROXY_ENABLED", "").lower() in {"1", "true", "yes"}
    proxy_url = os.getenv("SOCKS_PROXY", "")
    if proxy_enabled and proxy_url:
        if "://" not in proxy_url:
            proxy_url = f"socks5://{proxy_url}"
        if proxy_url.startswith("socks5h://"):
            proxy_url = proxy_url.replace("socks5h://", "socks5://", 1)
        try:
            http_client = httpx.AsyncClient(proxy=proxy_url, timeout=60.0)
        except TypeError:
            http_client = httpx.AsyncClient(proxies=proxy_url, timeout=60.0)
        set_default_openai_client(AsyncOpenAI(http_client=http_client))
        set_tracing_disabled(True)
    agent = build_agent()
    print('Alarm assistant (Python) ready. Type a request, or "exit" to quit.')
    while True:
        line = input("> ").strip()
        if not line or line.lower() == "exit":
            break
        result = Runner.run_sync(agent, line)
        print(result.final_output)


if __name__ == "__main__":
    main()
