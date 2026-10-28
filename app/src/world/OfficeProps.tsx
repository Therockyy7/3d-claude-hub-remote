"use client";

import { useRenderCount } from "@/world/renderCounts";
import { FocusExtras } from "@/world/props/FocusExtras";
import { MeetingRooms } from "@/world/props/MeetingRooms";
import { PlayLounge } from "@/world/props/PlayLounge";

/**
 * Everything beyond the desks, hub and boards (Workstations.tsx), by zone: the Focus-zone extras (library, server
 * room, whiteboard, aquarium, zen garden), the glass Meeting Pod and War Room, and the Play & Recharge Lounge.
 * Robots walk around all of it (worldLayout `OBSTACLES`) and use it on their breaks (`BREAK_SPOTS`).
 */
export function OfficeProps() {
  useRenderCount("OfficeProps");
  return (
    <group name="office-props">
      <FocusExtras />
      <MeetingRooms />
      <PlayLounge />
    </group>
  );
}
