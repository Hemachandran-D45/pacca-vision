export function Sparkline({
  tone = "teal",
}: {
  tone?: "teal" | "blue" | "green" | "amber" | "purple" | "red";
}) {
  const colors = {
    teal: "#47a2b0", // Emids Teal
    blue: "#00b0f0", // Sterile Blue
    green: "#45bd8d", // Surgeon Green
    amber: "#f2c94c", // Emids Yellow
    purple: "#b89dcb", // Emids Mauve
    red: "#e04f4f", // Signal Red
  };
  const stroke = colors[tone] ?? colors.teal;

  return (
    <svg viewBox="0 0 120 32" className="h-8 w-full overflow-visible" aria-hidden="true">
      <path
        d="M1 25 C 8 22, 10 26, 17 21 S 25 26, 32 20 S 42 22, 48 15 S 57 20, 65 16 S 76 23, 82 12 S 94 18, 101 10 S 111 17, 119 6"
        fill="none"
        stroke={stroke}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M1 25 C 8 22, 10 26, 17 21 S 25 26, 32 20 S 42 22, 48 15 S 57 20, 65 16 S 76 23, 82 12 S 94 18, 101 10 S 111 17, 119 6 L119 32 L1 32Z"
        fill={stroke}
        opacity=".1"
      />
    </svg>
  );
}
