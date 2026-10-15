import { notFound } from 'next/navigation';
import { ProjectChatIndex } from '../../features/project-chat/project-chat';
export default function WorkPage() {
  if (process.env.FEATURE_PROJECT_CHAT !== 'true') notFound();
  return <ProjectChatIndex />;
}
