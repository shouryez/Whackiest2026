import { redirect } from "next/navigation";

export default async function ElderMoved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app?elder=${id}`);
}
