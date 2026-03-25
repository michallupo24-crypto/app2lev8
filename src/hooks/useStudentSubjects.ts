import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Core subjects that every student takes regardless of tracks.
 */
const CORE_SUBJECTS = [
  "מתמטיקה", "אנגלית", "עברית", "ספרות", "היסטוריה",
  "אזרחות", "תנ\"ך", "חינוך גופני",
];

export interface StudentTrackInfo {
  trackName: string;
  trackType: string; // "megama_a" | "megama_b" | "hakbatza"
}

export interface StudentSubjectsResult {
  /** All subjects the student studies (core + tracks) */
  subjects: string[];
  /** Just the track names (megamot + hakbatzot) */
  trackNames: string[];
  /** Full track info with types */
  tracks: StudentTrackInfo[];
  /** Whether the student has any megama_a tracks */
  hasMegamaA: boolean;
  /** Whether the student has any megama_b tracks */
  hasMegamaB: boolean;
  /** Whether data is still loading */
  loading: boolean;
}

/**
 * Fetches student's tracks from student_tracks and combines with core subjects.
 * Returns all subjects the student is enrolled in.
 */
export const useStudentSubjects = (userId: string | undefined, schoolId: string | null): StudentSubjectsResult => {
  const [tracks, setTracks] = useState<StudentTrackInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !schoolId) {
      setLoading(false);
      return;
    }

    const load = async () => {
      const { data } = await supabase
        .from("student_tracks")
        .select("track_name, track_type")
        .eq("user_id", userId)
        .eq("school_id", schoolId);

      setTracks((data || []).map(t => ({ trackName: t.track_name, trackType: t.track_type })));
      setLoading(false);
    };
    load();
  }, [userId, schoolId]);

  const trackNames = useMemo(() => tracks.map(t => t.trackName), [tracks]);
  const hasMegamaA = useMemo(() => tracks.some(t => t.trackType === "megama_a"), [tracks]);
  const hasMegamaB = useMemo(() => tracks.some(t => t.trackType === "megama_b"), [tracks]);
  const subjects = useMemo(() => [...new Set([...CORE_SUBJECTS, ...trackNames])], [trackNames]);

  return { subjects, trackNames, tracks, hasMegamaA, hasMegamaB, loading };
};

/**
 * Filters grade events to only those relevant to a student's subjects.
 * - Events with a subject field: must match student's subjects
 *   (but "מורחב" variants are only shown if explicitly in student's tracks)
 * - Events with no subject and title containing "אשכול א'" → only if student has megama_a
 * - Events with no subject and title containing "אשכול ב'" → only if student has megama_b
 * - Events with no subject and no "אשכול" → pass through (general events)
 */
export const filterEventsBySubjects = <T extends { subject: string | null; title: string }>(
  events: T[],
  subjects: string[],
  hasMegamaA: boolean = true,
  hasMegamaB: boolean = true,
): T[] => {
  if (subjects.length === 0) return events;

  return events.filter(e => {
    // If event has a subject field set
    if (e.subject) {
      // Check if the title or subject indicates "מורחב" variant
      const titleLower = e.title;
      const isMurchav = titleLower.includes("מורחב");
      if (isMurchav) {
        // For "מורחב" events, check if the specific "X מורחב" is in subjects
        const murchavSubject = `${e.subject} מורחב`;
        return subjects.includes(murchavSubject) || subjects.includes(e.subject + " מורחב");
      }
      return subjects.includes(e.subject);
    }

    // No subject field - check if it's a cluster event
    if (e.title.includes("אשכול א") || e.title.includes("אשכול א׳")) {
      return hasMegamaA;
    }
    if (e.title.includes("אשכול ב") || e.title.includes("אשכול ב׳")) {
      return hasMegamaB;
    }

    // General event (no subject, no cluster) - show to all
    return true;
  });
};

/**
 * For a cluster event title, extracts only the subjects relevant to the student.
 * Falls back to original title if no match found.
 */
export const personalizeEventTitle = (
  title: string,
  subject: string | null,
  trackNames: string[],
): string => {
  // If it's not a cluster event, return as-is
  if (!title.includes("אשכול")) return title;

  // Try to find matching track names mentioned in the title
  const matched = trackNames.filter(track => title.includes(track));
  if (matched.length > 0) {
    // Extract the type prefix (בוחן, מבחן, מתכונת, etc.)
    const prefixes = ["בוחן", "מבחן", "מתכונת", "בגרות"];
    const prefix = prefixes.find(p => title.includes(p)) || "";
    return `${prefix} ${matched.join(", ")}`.trim();
  }

  return title;
};
