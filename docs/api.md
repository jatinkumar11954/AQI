# SaansAI API

Production API origin is [Render](https://aqi-0xk3.onrender.com). The public frontend makes credential-free HTTPS requests. The API allows browser access from the configured exact Pages origin. The Render service also recognizes its own documented public URL for same-site assistant requests behind TLS termination. Assistant requests require JSON. Responses use `Cache-Control: no-store`. Internal caches reuse provider results.

| Method and route | Request | Success | Common failures |
|---|---|---|---|
| `GET /api/health` | None | `{"status":"ok"}` | Hosting or network failure |
| `GET /api/ready` | None | `{"status":"ready"}` | `503 {"status":"not_ready"}` for an invalid configured Pages origin |
| `GET /api/places?q=Pune` | Indian city or neighbourhood, 2–64 characters | `{places: City[]}`, possibly empty | `400 INVALID_SEARCH`, `429 RATE_LIMIT` or `UPSTREAM_LIMIT`, `503 UPSTREAM_UNAVAILABLE` |
| `GET /api/environment?lat=28.61&lon=77.21` | Numeric coordinates within the app’s India bounds | `Environment` with individual feed states, including partial results | `400 INVALID_LOCATION`, `429 RATE_LIMIT` |
| `POST /api/ask` | JSON question, city coordinates, household settings and optional `language` | `Answer` with a mode, status, text and reviewed source IDs | `400 INVALID_QUESTION`, `403 FORBIDDEN_ORIGIN`, `413 BODY_TOO_LARGE`, `415 CONTENT_TYPE`, `429 RATE_LIMIT` |

Readiness checks local configuration and makes no upstream calls. Most errors use `{"error":{"code":"…","message":"…"}}`. Rate-limited HTTP responses carry `Retry-After: 60`.

## Environment

- `air` contains CAMS current and hourly modeled values, and `airStatus` describes freshness or availability. `aqi` follows the US scale. `pm25` and `pm10` are µg/m³. Each field can be null when missing.
- `weather` contains Open-Meteo model estimates, or null.
- `station` contains either OpenAQ concentrations with sensor timestamps or India-scale CPCB relay sub-indices. `stationStatus` is separate from model status. When OpenAQ is selected and a CPCB relay report is available, `india` adds that independent station report and freshness state.
- Numeric timestamps are Unix seconds. Use `Asia/Kolkata` for display. See [data methodology](methodology.md) for time and location limits and [runtime types](../src/shared/model.ts) for the complete schema.

## Example assistant request

```json
{
  "question": "Should we change my child’s outdoor play time and open the windows later?",
  "location": {"lat": 28.61, "lon": 77.21},
  "profile": {
    "children": true, "seniors": false, "sensitive": false, "work": "office",
    "commute": "transit", "workStart": 9, "workEnd": 17,
    "activity": "play", "budget": "zero"
  },
  "language": "en"
}
```

The response includes `mode` (`gemini` or `rules`), `text`, `sources` and optional `followUp`. A rules response can include a fallback reason (`unconfigured`, `privacy`, `quota` or `unavailable`). Gemini receives the question and a small subset of the context. Its response is limited to approved topic IDs, and the API composes the answer and citations. The implementation applies per-client and per-process limits.
