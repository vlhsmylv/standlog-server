import { Request, Response } from "express";
import prisma from "../prisma";
import { ok } from "assert/strict";

export interface Event {
  type: "pageview" | "click" | "scroll" | "hover" | string;
  metadata: {
    url: string;
    title: string;
    timestamp: number;
    userAgent: string;
    viewport: {
      width: number;
      height: number;
    };
    page: {
      url: string;
      title: string;
      referrer?: string;
    };
  };
  data: {
    sessionId: string;
    userId?: string;
    timestamp: number;
    page: {
      url: string;
      title: string;
      referrer?: string;
    };
    device: {
      type: "desktop" | "mobile" | "tablet" | string;
      browser: string;
      language?: string;
    };
    viewport: {
      width: number;
      height: number;
    };
  };
}

/**
 * Creates a new session record.
 * @param req - The Express request object containing anonymousId and metadata in the body.
 * @param res - The Express response object.
 */
export async function createSession(req: Request, res: Response) {
  try {
    const { anonymousId, metadata } = req.body;

    if (!anonymousId) {
      return res.status(400).json({
        success: false,
        error: "anonymousId is required",
      });
    }

    const newSession = await prisma.session.create({
      data: {
        anonymousId,
        metadata,
      },
    });

    return res.status(201).json({
      id: newSession.id,
      anonymousId: newSession.anonymousId,
      success: true,
    });
  } catch (error) {
    console.error("Failed to create session:", error);
    return res.status(500).json({
      error: "Internal server error",
      success: false,
    });
  }
}

/**
 * Logs a new event associated with a session.
 * @param req - The Express request object with sessionId, type, metadata, and data in the body.
 * @param res - The Express response object.
 */
export async function logEvent(req: Request, res: Response) {
  try {
    const { sessionId, events } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "sessionId and type are required",
      });
    }

    // Check if the session exists
    const sessionExists = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!sessionExists) {
      return res.status(404).json({
        success: false,
        error: "Session not found",
      });
    }

    const newEvents = await prisma.event.createMany({
      data: events.map((event: Event) => ({
        sessionId,
        ...event,
      })),
    });

    return res.status(201).json({
      success: true,
      eventsProcessed: newEvents.count,
      sessionId,
    });
  } catch (error) {
    console.error("Failed to log event:", error);
    return res.status(500).json({
      error: "Internal server error",
      success: false,
    });
  }
}

/**
 * Generates a new report by aggregating data from sessions and events.
 * This is a private helper function.
 */
async function generateReport() {
  const sessions = await prisma.session.findMany({
    include: {
      events: true,
    },
  });

  const reportData = {
    totalSessions: sessions.length,
    sessions: sessions.map((session) => ({
      id: session.id,
      anonymousId: session.anonymousId,
      metadata: session.metadata,
      data: session.events,
      totalEvents: session.events.length,
      eventsByType: session.events.reduce(
        (acc: { [key: string]: number }, event) => {
          acc[event.type] = (acc[event.type] || 0) + 1;
          return acc;
        },
        {}
      ),
    })),
  };

  const newReport = await prisma.reports.create({
    data: {
      data: reportData,
    },
  });

  return newReport;
}

/**
 * Endpoint to get the latest report, generating a new one if it's older than 5 minutes.
 * @param req - The Express request object.
 * @param res - The Express response object.
 */
export async function getLatestReport(req: Request, res: Response) {
  try {
    const latestReport = await prisma.reports.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (!latestReport) {
      const newReport = await generateReport();
      return res.status(200).json(newReport);
    }

    const now = new Date();
    const reportDate = latestReport.createdAt;
    const diffInMinutes = (now.getTime() - reportDate.getTime()) / 1000 / 60;

    if (diffInMinutes > 0) {
      const newReport = await generateReport();
      return res.status(200).json(newReport);
    } else {
      return res.status(200).json(latestReport);
    }
  } catch (error) {
    console.error("Failed to get report:", error);
    return res.status(500).json({
      error: "Internal server error",
      success: false,
    });
  }
}
