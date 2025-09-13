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

  const geminiResponse = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY as string,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are an AI analytics engine for the website analytics platform StandLog. I will provide you with raw website usage session data (see below). Do not add any commentary. Just give the json. Instructions: Analyze the provided dataset. Output your findings ONLY as a single JSON object in the following format: { "totalPageViews": 15690, "uniqueVisitors": 10000, "conversionRate": "3.4%", "avgSessionTime": "3 min 40 sec", "conversionFunnel": [ {"step": "Landing Page", "visitors": 10000, "percent": "100%"}, {"step": "Product View", "visitors": 7500, "percent": "75%"}, {"step": "Add to Cart", "visitors": 3000, "percent": "30%"}, {"step": "Checkout", "visitors": 1200, "percent": "12%"}, {"step": "Purchase", "visitors": 340, "percent": "3.4%"} ], "topPages": [ {"page": "/", "views": 5678, "bounceRate": "45%", "trend": "up"}, {"page": "/products", "views": 4321, "bounceRate": "38%", "trend": "up"}, {"page": "/about", "views": 2890, "bounceRate": "52%", "trend": "up"}, {"page": "/contact", "views": 1567, "bounceRate": "33%", "trend": "up"}, {"page": "/pricing", "views": 1234, "bounceRate": "41%", "trend": "up"} ] } Personas: 2–4 key user types observed, their behaviors, and approx. session count. Summary: 2–3 sentences with actionable, non-technical insights. Recommendations: Each item is a concrete suggestion for improving conversions, decreasing bounce rates/drop-offs, or guiding the user through the funnel on the dashboard site. Prioritize clear actions referencing the observed session behavior. Session Data: ${reportData}`,
              },
            ],
          },
        ],
      }),
    }
  );

  console.log(geminiResponse);

  const geminiData = await geminiResponse.json();

  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/);

  let parsedData = null;

  if (jsonMatch && jsonMatch[1]) {
    try {
      parsedData = JSON.parse(jsonMatch[1]);
    } catch (e) {
      console.error("Invalid JSON:", e);
    }
  }

  console.log(parsedData);

  const newReport = await prisma.reports.create({
    data: {
      data: parsedData,
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
