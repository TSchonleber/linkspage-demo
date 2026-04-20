from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(
        title="link-in-bio",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    @app.get("/api/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    # routers registered by later workstreams
    return app


app = create_app()
