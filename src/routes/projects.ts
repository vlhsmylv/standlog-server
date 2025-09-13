import { Router } from "express";
import * as ctrl from "../controllers/projects.controller";

const router = Router();
router.post("/", ctrl.createProject);
router.get("/", ctrl.listProjects);
router.get("/:id", ctrl.getProject);

export default router;
