import type { Multer } from "multer";

declare global {
  namespace Express {
    interface User {
      id: string;
      email?: string; // <-- ทำ optional กันชน
      role: "ADMIN" | "OWNER" | "TENANT" | "STAFF";
    }

    interface Request {
      file?: Multer.File;
      files?: Multer.File[] | { [fieldname: string]: Multer.File[] };
      user?: User;
    }
  }
}

export {};