export function mockAuth(req, res, next) {
    const raw = req.header("x-mock-user") || "OWNER:owner_1";
    const [roleRaw, idRaw] = raw.split(":");
    const role = roleRaw;
    const id = idRaw || "owner_1";
    const ok = role === "ADMIN" || role === "OWNER" || role === "TENANT";
    if (!ok)
        return res.status(400).json({ message: "Invalid x-mock-user role" });
    next();
}
