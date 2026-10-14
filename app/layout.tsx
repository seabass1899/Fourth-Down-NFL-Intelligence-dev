import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'FourthDown | NFL Intelligence',description:'NFL analytics and personal wager research workspace. No wagering functionality.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
