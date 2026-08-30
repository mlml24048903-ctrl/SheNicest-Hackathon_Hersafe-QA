// 项目审查台页（图层审查与待办，PRD §10 页面 2）
import ReviewConsole from "@/components/ReviewConsole";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReviewConsole projectId={id} />;
}
