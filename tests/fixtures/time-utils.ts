/**
 * Time utilities for generating realistic workday timestamps.
 */

export interface TimeConfig {
	date: Date;
	workStart: number;  // hour 0-23
	workEnd: number;
	lunchStart: number;
	lunchEnd: number;
}

export function defaultTimeConfig(date?: Date): TimeConfig {
	return {
		date: date || new Date("2025-06-15T00:00:00"),
		workStart: 9,
		workEnd: 17,
		lunchStart: 12,
		lunchEnd: 13,
	};
}

type TimeSlot = "morning" | "focus" | "lunch" | "afternoon" | "winddown";

/** Generate a single timestamp within a specific slot. */
export function generateTimestamp(config: TimeConfig, slot: TimeSlot): Date {
	const d = new Date(config.date);
	let hourMin: number;
	let hourMax: number;

	switch (slot) {
		case "morning":
			hourMin = config.workStart;
			hourMax = config.workStart + 1;
			break;
		case "focus":
			hourMin = config.workStart + 1;
			hourMax = config.lunchStart;
			break;
		case "lunch":
			hourMin = config.lunchStart;
			hourMax = config.lunchEnd;
			break;
		case "afternoon":
			hourMin = config.lunchEnd;
			hourMax = config.workEnd - 1;
			break;
		case "winddown":
			hourMin = config.workEnd - 1;
			hourMax = config.workEnd;
			break;
	}

	const hour = hourMin + Math.random() * (hourMax - hourMin);
	const wholeHour = Math.floor(hour);
	const minute = Math.floor((hour - wholeHour) * 60);
	const second = Math.floor(Math.random() * 60);

	d.setHours(wholeHour, minute, second, 0);
	return d;
}

/** Distribute events realistically across a workday. */
export function generateTimeSeries(count: number, config: TimeConfig): Date[] {
	const distribution: TimeSlot[] = [];

	// Weight distribution: morning(20%), focus(30%), lunch(5%), afternoon(35%), winddown(10%)
	const weights: [TimeSlot, number][] = [
		["morning", 0.2],
		["focus", 0.3],
		["lunch", 0.05],
		["afternoon", 0.35],
		["winddown", 0.1],
	];

	for (const [slot, weight] of weights) {
		const n = Math.round(count * weight);
		for (let i = 0; i < n; i++) {
			distribution.push(slot);
		}
	}

	// Fill any remaining slots
	while (distribution.length < count) {
		distribution.push("afternoon");
	}

	const timestamps = distribution
		.slice(0, count)
		.map((slot) => generateTimestamp(config, slot));

	return timestamps.sort((a, b) => a.getTime() - b.getTime());
}

/** Create a timestamp at a specific hour:minute on the configured day. */
export function atTime(config: TimeConfig, hour: number, minute = 0): Date {
	const d = new Date(config.date);
	d.setHours(hour, minute, 0, 0);
	return d;
}
