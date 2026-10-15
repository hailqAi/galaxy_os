import { NextRequest } from 'next/server';
import { GET as forward } from '../../api/v1/[...path]/route';
export const dynamic = 'force-dynamic';
export function GET(request: NextRequest) {
  return forward(request, {
    params: Promise.resolve({ path: ['workspace-agent-auth', 'metadata'] }),
  });
}
