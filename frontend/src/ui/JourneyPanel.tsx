import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Flag, Sparkles, Trophy } from 'lucide-react'
import type { buildJourney, MissionId } from '../domain/journey'

export function JourneyPanel({
  journey,
  onMission,
  demo = false,
}: {
  journey: ReturnType<typeof buildJourney>
  onMission: (id: MissionId) => void
  demo?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const previous = useRef(journey.completed)
  useEffect(() => {
    if (journey.completed > previous.current && !demo) setCelebrate(true)
    previous.current = journey.completed
    const timer = window.setTimeout(() => setCelebrate(false), 2400)
    return () => window.clearTimeout(timer)
  }, [journey.completed, demo])
  return (
    <section
      className={`journey-panel ${celebrate ? 'milestone-reached' : ''}`}
      aria-labelledby="journey-title"
    >
      <div className="journey-heading">
        <span className="journey-symbol">
          <Flag size={21} />
        </span>
        <button
          className="text-button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="journey-missions"
        >
          {expanded ? 'Rotayı kapat' : 'Rotamı gör'} <ArrowRight size={15} />
        </button>
      </div>
      <h2 id="journey-title">{journey.label}</h2>
      <p>İyi bir bütçe, küçük adımlarla başlar.</p>
      <div
        className="journey-path"
        aria-label={`${journey.completed} / 4 adım tamamlandı`}
      >
        {journey.missions.map((mission, index) => (
          <span
            key={mission.id}
            className={mission.done ? 'done' : ''}
            title={mission.title}
          >
            {mission.done ? <Check size={16} /> : index + 1}
          </span>
        ))}
      </div>
      <div className="journey-score">
        <strong>
          {journey.points}
          <span> / 100 rota puanı</span>
        </strong>
        <span>{journey.completed}/4 adım</span>
      </div>
      {journey.next ? (
        <div className="next-mission">
          <span>Sıradaki küçük adım</span>
          <h3>{journey.next.title}</h3>
          <p>{journey.next.description}</p>
          <button
            className="journey-action"
            onClick={() => onMission(journey.next!.id)}
          >
            {journey.next.action}
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <div className="next-mission journey-finished">
          <Trophy size={25} />
          <h3>Bütçe pusulan hazır.</h3>
          <p>
            Yeni kayıtlarınla görünümü güncel tut. Eksilen bir adım olursa rotan
            da güncellenir.
          </p>
        </div>
      )}
      {expanded && (
        <ol id="journey-missions" className="mission-list">
          {journey.missions.map((mission) => (
            <li key={mission.id}>
              <span
                className={
                  mission.done ? 'mission-check done' : 'mission-check'
                }
              >
                {mission.done ? <Check size={14} /> : <Flag size={14} />}
              </span>
              <div>
                <strong>{mission.title}</strong>
                <p>
                  {mission.done ? 'Tamamlandı · 25 puan' : mission.description}
                </p>
              </div>
              {!mission.done && (
                <button
                  onClick={() => onMission(mission.id)}
                  aria-label={mission.action}
                >
                  <ArrowRight size={16} />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="journey-disclaimer">
        Puan, kayıtlarının tamamlanmasını gösterir; finansal başarı notu
        değildir.
      </p>
      <div className="milestone-message" role="status">
        {celebrate && (
          <>
            <Sparkles size={17} /> Bir adım daha tamamlandı. Güzel ilerleme!
          </>
        )}
      </div>
    </section>
  )
}
