/**
 * Timer helpers — pure functions only, used by both server actions and
 * the client-side RunningTimerBar tick.
 *
 * Single-active model: a user has at most one TimeEntry with stoppedAt
 * = null at any time. Starting a new timer auto-stops any previous
 * running entry. Stop is terminal — to log more time on the same task,
 * the user starts another entry. Daily/total rollups sum across all
 * stopped entries on a task.
 */

import { prisma } from './prisma'

export type RunningTimer = {
  id: string
  taskId: string
  startedAt: Date
  task: {
    id: string
    title: string
    project: { id: string; name: string; clientName: string | null; color: string | null }
  }
}

/**
 * The current running timer for a user, if any. Returns null when the
 * user has no entry with stoppedAt = null. Excludes timers that have
 * been running > 12 hours — those are almost always forgot-to-stops
 * and surface as the stale-timer banner instead.
 */
export async function getRunningTimer(userId: string): Promise<RunningTimer | null> {
  const e = await prisma.timeEntry.findFirst({
    where: { userId, stoppedAt: null },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      taskId: true,
      startedAt: true,
      task: {
        select: {
          id: true,
          title: true,
          project: {
            select: { id: true, name: true, clientName: true, color: true },
          },
        },
      },
    },
  })
  if (!e) return null
  if (Date.now() - e.startedAt.getTime() > 12 * 60 * 60 * 1000) return null
  return e
}

/** Same as getRunningTimer but returns even stale (>12h) entries. */
export async function getStaleTimer(userId: string): Promise<RunningTimer | null> {
  const e = await prisma.timeEntry.findFirst({
    where: { userId, stoppedAt: null },
    orderBy: { startedAt: 'asc' },
    select: {
      id: true,
      taskId: true,
      startedAt: true,
      task: {
        select: {
          id: true,
          title: true,
          project: {
            select: { id: true, name: true, clientName: true, color: true },
          },
        },
      },
    },
  })
  if (!e) return null
  if (Date.now() - e.startedAt.getTime() <= 12 * 60 * 60 * 1000) return null
  return e
}

export type TaskTimeRollup = {
  /** Sum of all stopped entries on this task, in minutes. Excludes the running entry. */
  totalMinutes: number
  /** Count of distinct entries that have been stopped on this task. */
  sessionCount: number
  /** Whether this user (the viewer) has a running entry on this task. */
  isRunningForViewer: boolean
}

export async function rollupForTask(taskId: string, viewerUserId: string): Promise<TaskTimeRollup> {
  const entries = await prisma.timeEntry.findMany({
    where: { taskId },
    select: { userId: true, startedAt: true, stoppedAt: true },
  })
  let totalMs = 0
  let sessions = 0
  let running = false
  for (const e of entries) {
    if (e.stoppedAt) {
      totalMs += e.stoppedAt.getTime() - e.startedAt.getTime()
      sessions += 1
    } else if (e.userId === viewerUserId) {
      running = true
    }
  }
  return {
    totalMinutes: Math.round(totalMs / 60000),
    sessionCount: sessions,
    isRunningForViewer: running,
  }
}

/** Format milliseconds as `H:MM:SS` (no leading zeros on hours). */
export function formatHMS(ms: number): string {
  if (ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const mm = m.toString().padStart(2, '0')
  const ss = s.toString().padStart(2, '0')
  return `${h}:${mm}:${ss}`
}

/** Format minutes as a short human label, e.g. "2h 14m" / "47m" / "0m". */
export function formatHumanDuration(minutes: number): string {
  if (minutes < 1) return '0m'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
