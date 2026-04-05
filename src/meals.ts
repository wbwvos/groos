import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function suggestMeals(knownMeals: string[], count: number = 3): Promise<string[]> {
  const prompt = `Je helpt bij het plannen van weekboodschappen voor twee personen.

Bekende favoriete maaltijden:
${knownMeals.map(m => `- ${m}`).join('\n')}

Stel ${count} avondmaaltijden voor voor deze week. Mix bekende favorieten met 1-2 nieuwe suggesties.
Geef alleen de maaltijdnamen terug, één per regel, zonder nummering of extra uitleg.`

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return text.split('\n').map(s => s.trim()).filter(Boolean).slice(0, count)
}
