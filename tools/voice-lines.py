"""Renders Itachi's call-outs with Microsoft Keita Neural (pip install edge-tts), into tools/_vo/.
They are then deepened (see public/audio/voice/README.txt) and saved as public/audio/voice/<key>.wav."""
import asyncio, os, edge_tts
os.makedirs("tools/_vo", exist_ok=True)
L = {
 'fireball':'かとん、ごうかきゅうのじゅつ。','phoenix':'かとん、ほうせんかつまべに。','summon':'くちよせのじゅつ。',
 'sharingan':'シャリンガン。','mangekyo':'マンゲキョウシャリンガン。','amaterasu':'アマテラス。','tsukuyomi':'ツクヨミ。',
 'izanami':'イザナミ。','susanoo':'スサノオ。','totsuka':'とつかのつるぎ。','yata':'やたのかがみ。','kotoamatsukami':'コトアマツカミ。'}
async def main():
    for k,t in L.items():
        await edge_tts.Communicate(t,'ja-JP-KeitaNeural',rate='+0%',pitch='-8Hz').save(f'tools/_vo/{k}.mp3')
        print(k)
asyncio.run(main())
