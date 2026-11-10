(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // game.js — G.Engine facade.
  //   G.Engine.createGame(cfg) → Game (call await game.start())
  //   G.Engine.deserialize(json) → Game
  //   G.Engine.Game (class), G.Engine.Ctx, constants
  // ---------------------------------------------------------------
  const Game = G.Engine.Game;

  // cfg: { seed, players: [{deck:[defIds], relics:[ids], isAI, name, life, enemyDefId, chooser}, {...}],
  //        field: defId|null, options: { firstPlayer, initialHand, noShuffle, aiMistakeRate, fieldOwner }, turnLimit }
  G.Engine.createGame = function (cfg) {
    cfg = cfg || {};
    const players = (cfg.players || [{}, {}]).map(function (pc, i) {
      pc = pc || {};
      const out = Object.assign({}, pc);
      if (pc.enemyDefId && G.EnemyDB.has(pc.enemyDefId)) {
        const e = G.EnemyDB.get(pc.enemyDefId);
        if (out.deck === undefined) out.deck = e.deck.slice();
        if (out.life === undefined) out.life = e.life;
        if (out.relics === undefined) out.relics = e.relics.slice();
        if (out.name === undefined) out.name = e.name;
        if (out.isAI === undefined) out.isAI = true;
        if (cfg.field === undefined && e.field) { cfg.field = e.field; cfg.options = Object.assign({ fieldOwner: i }, cfg.options || {}); }
      }
      return out;
    });
    const game = new Game({ seed: cfg.seed, players: players, field: cfg.field || null, options: cfg.options, turnLimit: cfg.turnLimit });
    for (let i = 0; i < 2; i++) {
      game.players[i].chooser = players[i].chooser || Game.defaultChooser;
      if (players[i].hazardTests) game.players[i].hazardTests = players[i].hazardTests;
    }
    return game;
  };

  G.Engine.deserialize = function (json) { return Game.deserialize(json); };

  // Convenience: human-readable summary (debugging / tests).
  Game.prototype.summary = function () {
    const self = this;
    function zone(arr) { return arr.map(function (c) { return G.CardDB.get(c.defId).name + (c.isPhantom ? '*' : ''); }).join(', '); }
    return this.players.map(function (p) {
      return p.name + ' L' + p.life + ' M' + p.mana + '/' + p.maxMana + ' 呪' + p.curse + ' 連' + self.chainOf(p) +
        '\n  手札: ' + zone(p.hand) + '\n  場: ' + zone(p.board) + (p.phantoms.length ? ' 幻影×' + p.phantoms.length : '') +
        '\n  紋章: ' + zone(p.crests) + '\n  墓地(' + p.grave.length + ') 山札(' + p.deck.length + ') 除外(' + p.exile.length + ')';
    }).join('\n') + '\nフィールド: ' + (this.field ? G.CardDB.get(this.field.defId).name : 'なし') + '  ターン' + this.turn + ' 手番:' + this.active;
  };
})(globalThis.G = globalThis.G || {});
