import { notFound } from "next/navigation";
import { getSubmission, getSubmissionsQueue } from "@/lib/submissions/getSubmission";
import { SubmissionReviewClient } from "@/components/submissions/SubmissionReviewClient";

export const dynamic = "force-dynamic";

export default async function SubmissionReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [submission, queue] = await Promise.all([getSubmission(id), getSubmissionsQueue()]);

  if (!submission) notFound();

  return <SubmissionReviewClient submission={submission} queue={queue} />;
}
