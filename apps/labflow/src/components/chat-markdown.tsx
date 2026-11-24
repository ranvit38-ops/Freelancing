import { RichText } from './rich-text';

/**
 * LabBot's answers and documents: the same formatting people can type
 * anywhere in the app (see rich-text), so what the model writes and what a
 * person writes look alike. Tolerates a half-written answer, since it
 * re-renders on every streamed word.
 */
export function ChatMarkdown({ text }: { text: string }) {
  return <RichText text={text} className="space-y-1.5 text-sm leading-6" />;
}
