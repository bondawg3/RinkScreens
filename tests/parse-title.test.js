import { describe, it, expect } from 'vitest';
import { parseTitle } from '../server/calendar.js';

describe('parseTitle', () => {
  describe('colon rule', () => {
    it('splits title before colon and matchup after', () => {
      expect(parseTitle('CON: Sharks vs Jets', null)).toEqual({
        title: 'CON',
        away_team: 'Sharks',
        home_team: 'Jets',
      });
    });

    it('handles "vs." with a period', () => {
      expect(parseTitle('DIV3: Bears vs. Wolves', null)).toEqual({
        title: 'DIV3',
        away_team: 'Bears',
        home_team: 'Wolves',
      });
    });

    it('keeps the pre-colon title even when the matchup has no vs', () => {
      const r = parseTitle('CON: something else', null);
      expect(r.title).toBe('CON');
      expect(r.away_team).toBe('');
      expect(r.home_team).toBe('');
    });
  });

  describe('no colon', () => {
    it('clears the title when the whole title is a matchup', () => {
      expect(parseTitle('Sharks vs Jets', null)).toEqual({
        title: '',
        away_team: 'Sharks',
        home_team: 'Jets',
      });
    });

    it('keeps the full raw title when there is no vs', () => {
      const r = parseTitle('Holiday Tournament', null);
      expect(r.title).toBe('Holiday Tournament');
      expect(r.away_team).toBe('');
      expect(r.home_team).toBe('');
    });
  });

  describe('team order setting', () => {
    it('defaults to away_home (first team is away)', () => {
      const r = parseTitle('A vs B', { name: 'League', team_order: 'away_home' });
      expect(r.away_team).toBe('A');
      expect(r.home_team).toBe('B');
    });

    it('flips when calendar team_order is home_away', () => {
      const r = parseTitle('A vs B', { name: 'League', team_order: 'home_away' });
      expect(r.home_team).toBe('A');
      expect(r.away_team).toBe('B');
    });
  });

  describe('pickup / practice events', () => {
    it.each(['Practice', 'Scrimmage', 'League Pickup'])(
      'marks both teams Open for "%s"',
      (raw) => {
        const r = parseTitle(raw, null);
        expect(r.away_team).toBe('Open');
        expect(r.home_team).toBe('Open');
        expect(r.title).toBe(raw);
      }
    );

    it('normalizes Stick & Shoot casing', () => {
      const r = parseTitle('ADULT STICK & SHOOT', null);
      expect(r.title).toBe('ADULT Stick & Shoot');
      expect(r.away_team).toBe('Open');
      expect(r.home_team).toBe('Open');
    });

    it('handles extra whitespace around the ampersand', () => {
      const r = parseTitle('Stick  &  Shoot', null);
      expect(r.away_team).toBe('Open');
    });

    it('keeps the full raw title even when a pickup title contains a colon', () => {
      const r = parseTitle('CON: Practice', null);
      expect(r.title).toBe('CON: Practice');
      expect(r.away_team).toBe('Open');
      expect(r.home_team).toBe('Open');
    });
  });

  describe('NCWHL calendars', () => {
    const cal = { name: 'NCWHL Maroon' };

    it('takes everything through "Game" as the title and uses the (Home)/(Away) tags', () => {
      const r = parseTitle('Maroon Game M2 (Home) vs. M7 (Away)', cal);
      expect(r.title).toBe('Maroon Game');
      expect(r.home_team).toBe('M2');
      expect(r.away_team).toBe('M7');
    });

    it('(Home)/(Away) tags win over the team_order setting', () => {
      const r = parseTitle('Maroon Game M2 (Away) vs. M7 (Home)', {
        ...cal,
        team_order: 'home_away', // would put M2 home — the (Away) tag overrides
      });
      expect(r.away_team).toBe('M2');
      expect(r.home_team).toBe('M7');
    });

    it('falls back to team_order when no tags are present', () => {
      const noTags = parseTitle('Blue Game A vs B', { name: 'NCWHL Blue' });
      expect(noTags.away_team).toBe('A'); // default away_home

      const flipped = parseTitle('Blue Game A vs B', { name: 'NCWHL Blue', team_order: 'home_away' });
      expect(flipped.home_team).toBe('A');
    });

    it('does not apply the colon rule for NCWHL', () => {
      const r = parseTitle('Maroon Game: M2 vs M7', cal);
      // "Game" match wins; colon stays inside the matchup remainder
      expect(r.title).toBe('Maroon Game');
    });

    it('is case-insensitive on the calendar name', () => {
      const r = parseTitle('Blue Game A vs B', { name: 'ncwhl blue' });
      expect(r.title).toBe('Blue Game');
    });
  });
});
