# Platform Analytics Web

Custom HTML dashboard for the Enterprise Data Platform analytics agent.

This repo is a second frontend for the existing `platform-analytics-agent`
FastAPI backend. It does not replace or modify the Streamlit UI.

## Architecture

```text
Browser
  -> platform-analytics-web
  -> /api proxy or same-origin route
  -> platform-analytics-agent FastAPI
  -> Claude + Athena/Redshift + S3/dbt artifacts
```

The app uses the existing backend endpoints:

- `GET /health`
- `GET /examples`
- `POST /ask/stream`
- `POST /report/pdf`
- `GET /engineer-log`

## Local development

Start the existing analytics backend first:

```bash
cd ../platform-analytics-agent
uvicorn agent.main:app --host 0.0.0.0 --port 8080
```

Then start this frontend:

```bash
cd ../platform-analytics-web
npm run dev
```

Open:

```text
http://localhost:5173
```

The local server proxies `/api/*` to `http://localhost:8080/*`, avoiding browser
CORS issues without changing the existing backend.

To point at a different backend:

```bash
BACKEND_URL=http://your-backend-host:8080 npm run dev
```

To expose the dev server on another interface:

```bash
HOST=0.0.0.0 PORT=5173 npm run dev
```

## Production deployment

The frontend is static HTML/CSS/JS. For production, host `src/` behind the same
domain as the analytics API, or configure a reverse proxy/CloudFront behavior:

```text
/        -> static frontend
/api/*   -> FastAPI backend, stripping /api
```

That keeps the browser same-origin and avoids changing the working Streamlit
deployment.
