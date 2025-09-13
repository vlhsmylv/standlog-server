import { Router } from "express";
import * as ctrl from "../controllers/session.controller";

const router = Router();
router.post("/session", ctrl.createSession);
router.post("/event", ctrl.logEvent);
router.get("/report", ctrl.getLatestReport);

export default router;
