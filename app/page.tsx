import CharacterCanvas from "@/components/CharacterCanvas";

export default function Home() {
  return (
    <main className="viewerShell">
      <section className="stage">
        <CharacterCanvas />
      </section>
    </main>
  );
}
