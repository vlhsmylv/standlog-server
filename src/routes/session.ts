import { Router } from "express";
import * as ctrl from "../controllers/session.controller";

const router = Router();
router.post("/session", ctrl.createSession);
router.post("/event", ctrl.logEvent);
router.post("/error", ctrl.logError);

export default router;
