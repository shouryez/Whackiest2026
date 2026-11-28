"use client";
import { StoryBook } from "@/components/StoryBook";
import { useElder } from "@/lib/elder";

export default function StoriesPage() {
  const { elderId, n } = useElder();
  return <StoryBook elderId={elderId} n={n} />;
}
