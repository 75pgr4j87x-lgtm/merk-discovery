// Ambient meditative soundtrack and tactile audio feedback engine using Web Audio API

class SoundTrackManager {
  private ctx: AudioContext | null = null;
  private isAmbientPlaying: boolean = false;
  private isMuted: boolean = false;
  private masterAmbientGain: GainNode | null = null;
  private activeVoices: { osc: OscillatorNode; gain: GainNode }[] = [];
  private chordIntervalId: number | null = null;
  private initialized: boolean = false;

  // Meditative frequencies (Warm D pentatonic / ambient dream chords)
  // Peaceful, calm, floating meditative pad notes (Hz)
  private chords = [
    // Chord 1: Dadd9 (Floating peace)
    [146.83, 220.0, 293.66, 369.99, 440.0],
    // Chord 2: Gmaj9 (Warm earth)
    [196.0, 246.94, 293.66, 392.0, 440.0],
    // Chord 3: Bm7 (Reflective stillness)
    [123.47, 220.0, 277.18, 369.99, 440.0],
    // Chord 4: A6/9 (Soft dawn)
    [110.0, 220.0, 277.18, 329.63, 440.0],
  ];
  private currentChordIndex = 0;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Initialize listener on user interaction to comply with browser autoplay policies
  public initAutoPlayOnFirstInteraction() {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    const startOnGesture = () => {
      const ctx = this.getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => {
          if (!this.isAmbientPlaying && !this.isMuted) {
            this.startAmbientMusic();
          }
        });
      } else if (!this.isAmbientPlaying && !this.isMuted) {
        this.startAmbientMusic();
      }
      window.removeEventListener('click', startOnGesture);
      window.removeEventListener('keydown', startOnGesture);
      window.removeEventListener('touchstart', startOnGesture);
    };

    window.addEventListener('click', startOnGesture, { once: true });
    window.addEventListener('keydown', startOnGesture, { once: true });
    window.addEventListener('touchstart', startOnGesture, { once: true });
  }

  // Start calming meditative generative soundscape
  public startAmbientMusic() {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    if (this.isAmbientPlaying) return;
    this.isAmbientPlaying = true;

    // Master ambient gain for smooth fade-in/fade-out
    if (!this.masterAmbientGain) {
      this.masterAmbientGain = ctx.createGain();
      // Warm lowpass filter to ensure silky, velvety calmness (removes any digital harshness)
      const masterFilter = ctx.createBiquadFilter();
      masterFilter.type = 'lowpass';
      masterFilter.frequency.value = 460; // Softer, warmer acoustic profile
      masterFilter.Q.value = 0.5;

      this.masterAmbientGain.connect(masterFilter);
      masterFilter.connect(ctx.destination);
    }

    const now = ctx.currentTime;
    this.masterAmbientGain.gain.cancelScheduledValues(now);
    this.masterAmbientGain.gain.setValueAtTime(this.masterAmbientGain.gain.value || 0.0005, now);
    // Gentle 4.5-second peaceful swell fade-in at 50% reduced level (0.09 max)
    this.masterAmbientGain.gain.linearRampToValueAtTime(0.09, now + 4.5);

    this.playNextChord();

    // Transition smoothly between chords every 11 seconds for extra calmness
    if (this.chordIntervalId) clearInterval(this.chordIntervalId);
    this.chordIntervalId = window.setInterval(() => {
      if (this.isAmbientPlaying) {
        this.currentChordIndex = (this.currentChordIndex + 1) % this.chords.length;
        this.playNextChord();
      }
    }, 11000);
  }

  // Smoothly blend in next contemplative harmonic chord
  private playNextChord() {
    const ctx = this.getAudioContext();
    if (!ctx || !this.masterAmbientGain || !this.isAmbientPlaying) return;

    const notes = this.chords[this.currentChordIndex];
    const now = ctx.currentTime;

    // Fade out previous voices over 5.5 seconds for seamless blend
    const oldVoices = [...this.activeVoices];
    this.activeVoices = [];
    oldVoices.forEach(({ osc, gain }) => {
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0.00005, now + 5.5);
        setTimeout(() => {
          try {
            osc.stop();
            osc.disconnect();
          } catch (_) {}
        }, 6000);
      } catch (_) {}
    });

    // Create new chord layers with gentle subtle detune
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const voiceGain = ctx.createGain();

      // Pure sine waves only for maximum warmth, smoothness, and zero harsh overtones
      osc.type = 'sine';
      // Very gentle micro-detune (±0.18 Hz) for serene ambient shimmer without pulsing
      const detuneOffset = (idx - 2) * 0.18;
      osc.frequency.setValueAtTime(freq + detuneOffset, now);

      // 50% reduced volume per voice to keep total sound gentle, soft, and unobtrusive
      const targetVolume = idx === 0 ? 0.024 : 0.014;
      voiceGain.gain.setValueAtTime(0.00005, now);
      // Soft, slow gradual attack (5.0 seconds)
      voiceGain.gain.linearRampToValueAtTime(targetVolume, now + 5.0);

      osc.connect(voiceGain);
      voiceGain.connect(this.masterAmbientGain!);
      osc.start(now);

      this.activeVoices.push({ osc, gain: voiceGain });
    });
  }

  // Fade out music when flow finishes
  public stopAmbientMusic(fadeDurationSeconds = 3.0) {
    if (!this.isAmbientPlaying) return;
    this.isAmbientPlaying = false;

    if (this.chordIntervalId) {
      clearInterval(this.chordIntervalId);
      this.chordIntervalId = null;
    }

    const ctx = this.getAudioContext();
    if (ctx && this.masterAmbientGain) {
      const now = ctx.currentTime;
      this.masterAmbientGain.gain.cancelScheduledValues(now);
      this.masterAmbientGain.gain.setValueAtTime(this.masterAmbientGain.gain.value, now);
      this.masterAmbientGain.gain.linearRampToValueAtTime(0.00001, now + fadeDurationSeconds);
    }

    setTimeout(() => {
      this.activeVoices.forEach(({ osc }) => {
        try {
          osc.stop();
          osc.disconnect();
        } catch (_) {}
      });
      this.activeVoices = [];
    }, fadeDurationSeconds * 1000 + 200);
  }

  // Toggle Mute / Unmute
  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopAmbientMusic(1.0);
    } else {
      this.startAmbientMusic();
    }
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getIsPlaying(): boolean {
    return this.isAmbientPlaying && !this.isMuted;
  }

  // Synthesize a tactile, organic, calm "soft water drop" sound
  public playSoftDrop(pitchVariation = 1.0) {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // 1. Primary droplet sine body (rising liquid bubble)
      const osc = ctx.createOscillator();
      const dropGain = ctx.createGain();

      osc.type = 'sine';
      // Characteristic water-drop frequency sweep: starts mid, curves up sharply, then resonates
      const baseFreq = 720 * pitchVariation;
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.58, now + 0.025);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.95, now + 0.11);

      // Volume envelope: gentle attack, smooth exponential decay (50% reduced volume)
      dropGain.gain.setValueAtTime(0.0005, now);
      dropGain.gain.linearRampToValueAtTime(0.07, now + 0.015);
      dropGain.gain.exponentialRampToValueAtTime(0.00005, now + 0.15);

      // Filter to soften any transient click into a round, warm droplet
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1600, now);

      osc.connect(dropGain);
      dropGain.connect(filter);
      filter.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.16);

      // 2. Subtle soft crystalline harmonic overtone (50% reduced volume)
      const harmonicOsc = ctx.createOscillator();
      const harmonicGain = ctx.createGain();

      harmonicOsc.type = 'sine';
      harmonicOsc.frequency.setValueAtTime(baseFreq * 2.2, now);
      harmonicOsc.frequency.exponentialRampToValueAtTime(baseFreq * 2.8, now + 0.02);

      harmonicGain.gain.setValueAtTime(0.0005, now);
      harmonicGain.gain.linearRampToValueAtTime(0.02, now + 0.01);
      harmonicGain.gain.exponentialRampToValueAtTime(0.00005, now + 0.08);

      harmonicOsc.connect(harmonicGain);
      harmonicGain.connect(filter);

      harmonicOsc.start(now);
      harmonicOsc.stop(now + 0.09);
    } catch (_) {
      // AudioContext fallback
    }
  }
}

export const soundTrack = new SoundTrackManager();
