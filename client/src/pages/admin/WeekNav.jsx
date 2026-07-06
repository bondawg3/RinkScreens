import React from 'react';
import tabStyles from './GamesTab.module.css';
import { weekLabel } from '../../utils/date';

export default function WeekNav({ offset, onChange }) {
  return (
    <div className={tabStyles.weekNav}>
      <button className={tabStyles.weekBtn} onClick={() => onChange(offset - 1)}>&#8592; Prev</button>
      <span className={tabStyles.weekLabel}>{weekLabel(offset)}</span>
      <button className={tabStyles.weekBtn} onClick={() => onChange(offset + 1)}>Next &#8594;</button>
    </div>
  );
}
