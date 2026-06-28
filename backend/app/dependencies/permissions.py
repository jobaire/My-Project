from fastapi import HTTPException, Request, status

BYPASS_ROLES = {"admin", "super_admin", "platform_admin"}


def _all_roles(user: dict) -> list[str]:
    return user.get("roles") or ([user["role"]] if user.get("role") else [])


def require_permission(module: str, level: str = "r"):
    """
    FastAPI dependency factory for module-level permission checks.

    Usage:
        @router.get("/", dependencies=[Depends(require_permission("orders", "r"))])

    Levels: "r" = read, "w" = write, "a" = admin
    Admin and super_admin roles bypass all checks.
    """
    def _check(request: Request):
        user = request.state.user
        roles = _all_roles(user)
        if any(r in BYPASS_ROLES for r in roles):
            return
        perms: dict = user.get("perms") or {}
        module_perm = perms.get(module, "")
        if level not in module_perm:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permission for {module} ({level})",
            )
    return _check
