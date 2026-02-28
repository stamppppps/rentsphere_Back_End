import multer from "multer";
import type{FileFilterCallback} from "multer";

export const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits:{fileSize:5*1024*1024}, 
  fileFilter:(_req,file,cb:FileFilterCallback)=>{
    const ok=["image/png","image/jpeg","image/webp"].includes(file.mimetype);
    if (!ok) return cb(new Error("Only png/jpg/webp allowed"));
    return cb(null, true);
  },
});
