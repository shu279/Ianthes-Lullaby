import BGMPlayer from "@/components/BGMPlayer";
import CharacterCanvas from "@/components/CharacterCanvas";

export default function Home() {
  return (
    <main className="viewerShell">
      <section className="stage">
        <CharacterCanvas />
        <BGMPlayer />
      </section>
    </main>
  );
}
