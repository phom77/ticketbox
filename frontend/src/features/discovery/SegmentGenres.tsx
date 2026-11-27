import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DiscoveryFacets } from '../../api/performances';
import { classificationSegments, classificationText, segmentGenres } from './classification';
import './SegmentGenres.css';

/**
 * The genre browser of a segment page: the popular genres that have upcoming events as chips, and a "More genres" list
 * with every other genre that has events. Nothing renders until the facets say which genres have events.
 */
export function SegmentGenres({
  segment,
  genre,
  facets,
  onChoose,
}: {
  segment: string;
  genre: string;
  facets: DiscoveryFacets;
  onChoose: (genre: string) => void;
}) {
  const { t } = useTranslation('public');
  const moreId = useId();
  const [open, setOpen] = useState(false);
  const entry = classificationSegments.find((value) => value.id === segment);
  const counts = new Map(facets.genres.map((value) => [value.id, value.count]));
  // The facets are scoped to this segment, so genres of other segments that appear are tags on its events.
  const own = entry ? segmentGenres(entry).filter((value) => counts.has(value.id)) : [];
  const tags = classificationSegments
    .filter((value) => value.id !== segment)
    .flatMap((value) => segmentGenres(value))
    .filter((value) => counts.has(value.id));
  const available = [...own, ...tags];
  const popular = own.filter((value) => value.popular);
  const more = [...own.filter((value) => !value.popular), ...tags];
  const name = classificationText(segment, 'segment', t);
  const chip = (id: string) => (
    <li key={id}>
      <button
        type="button"
        aria-pressed={genre === id}
        onClick={() => onChoose(genre === id ? '' : id)}
      >
        {classificationText(id, 'genre', t)}
        <span className="segment-genres-count">{counts.get(id)}</span>
      </button>
    </li>
  );
  // A genre chosen from the URL stays visible and removable even when it has no upcoming events.
  const hidden = genre && !counts.has(genre) ? genre : '';

  return (
    <section className="segment-genres" aria-labelledby={`${moreId}-heading`}>
      <h2 id={`${moreId}-heading`}>{name}</h2>
      {available.length > 0 || hidden ? (
        <>
          <ul
            className="segment-genres-chips"
            aria-label={t('public:discovery_segmentGenres', { segment: name })}
          >
            <li>
              <button type="button" aria-pressed={!genre} onClick={() => onChoose('')}>
                {t('public:discovery_allSegmentEvents', { segment: name })}
              </button>
            </li>
            {hidden ? chip(hidden) : null}
            {popular.map((value) => chip(value.id))}
          </ul>
          {more.length > 0 ? (
            <>
              <button
                type="button"
                className="segment-genres-more"
                aria-expanded={open}
                aria-controls={moreId}
                onClick={() => setOpen((value) => !value)}
              >
                {t(open ? 'public:discovery_lessGenres' : 'public:discovery_moreGenres')}
              </button>
              <ul id={moreId} className="segment-genres-chips" hidden={!open}>
                {more.map((value) => chip(value.id))}
              </ul>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
