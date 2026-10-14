import {NextResponse} from 'next/server';export function GET(){return NextResponse.json({ok:true,version:'0.1.0',mode:'local-demo',liveData:false})}
