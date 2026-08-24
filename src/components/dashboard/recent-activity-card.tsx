"use client";

import { History } from "lucide-react";
import type { ActivityEvent } from "@/lib/services/dashboard";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SectionTitle } from "@/components/dashboard/section-title";
import { ActivityTimeline } from "@/components/dashboard/activity-timeline";

const VISIBLE_COUNT = 5;

export function RecentActivityCard({ events }: { events: ActivityEvent[] }) {
  return (
    <Card className="animate-fade-in-up">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <SectionTitle icon={History}>Recent Activity</SectionTitle>
        {events.length > VISIBLE_COUNT && (
          <Dialog>
            <DialogTrigger render={<Button variant="ghost" size="sm" className="text-primary" />}>
              See More
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Recent Activity</DialogTitle>
              </DialogHeader>
              <ActivityTimeline events={events} />
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        <ActivityTimeline events={events.slice(0, VISIBLE_COUNT)} />
      </CardContent>
    </Card>
  );
}
