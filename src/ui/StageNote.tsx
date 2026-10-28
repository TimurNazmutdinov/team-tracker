export function StageNote({ stage, what }: { stage: number; what: string }) {
  return (
    <p className="muted">
      Заглушка каркаса: {what} появится на этапе {stage}.
    </p>
  );
}
