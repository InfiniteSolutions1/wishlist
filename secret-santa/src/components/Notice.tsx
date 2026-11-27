export function Notice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="mb-6 rounded-lg border-2 border-pine/40 bg-green-50 px-4 py-3 font-semibold text-green-900">
      {message.slice(0, 200)}
    </p>
  );
}
