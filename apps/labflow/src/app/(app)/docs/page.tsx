import { redirect } from 'next/navigation';

/** Documents are listed with the lab's files; this address just leads there. */
export default function DocumentsIndex() {
  redirect('/files');
}
