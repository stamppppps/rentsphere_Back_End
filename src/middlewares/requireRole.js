export function requireRole(roles) {
    const allow = Array.isArray(roles) ? roles : [roles];
    return (req, res, next) => {
        const role = req.user?.role;
        if (!role)
            return res.status(401).json({ error: "Unauthorized" });
        if (!allow.includes(role))
            return res.status(403).json({ error: "Forbidden" });
        next();
    };
}
