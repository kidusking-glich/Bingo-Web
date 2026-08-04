import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string[] }> }
) {
  const { searchParams } = new URL(request.url);
  const callback = searchParams.get('__callback__');

  if (callback) {
    const jsonpResponse = `${callback}({});`;
    return new NextResponse(jsonpResponse, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
      },
    });
  }

  return NextResponse.json({});
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string[] }> }
) {
  return NextResponse.json({});
}
