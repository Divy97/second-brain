const listItem = /^\s*[-•]\s+/

// Answers that list several candidates come back as "- " lines; show them as a list.
export function AnswerText({ text }: { text: string }) {
  const lines = text.split("\n").filter((line) => line.trim())
  const isList = lines.length > 1 && lines.every((line) => listItem.test(line))
  const className =
    "max-w-[65ch] text-base leading-relaxed break-words md:text-sm"
  if (!isList) {
    return <p className={`${className} whitespace-pre-wrap`}>{text}</p>
  }
  return (
    <ul className={`${className} flex list-disc flex-col gap-2 pl-5`}>
      {lines.map((line, index) => (
        <li key={index}>{line.replace(listItem, "")}</li>
      ))}
    </ul>
  )
}
