/** Named, serializable values still validated by the receiving Server Action. */
export function HiddenFields({
  values,
}: {
  values: Readonly<Record<string, string | number>>;
}) {
  return (
    <>
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}
