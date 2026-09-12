const Glicko2 = require('glicko2');

/**
 * Updates both players using Glicko2, for your DB columns.
 * @param {object} killer - { dojo_elo_api, dojo_rd_api, dojo_vol_api, matchesPlayed }
 * @param {object} victim - { dojo_elo_api, dojo_rd_api, dojo_vol_api, matchesPlayed }
 * @param {number} killerResult - 1 if killer wins, 0 if victim wins
 * @returns {object} - { killer, victim }
 */
function updateGlicko2Api(killer, victim, killerResult = 1) {
    const killerMatches = killer.matchesPlayed || 0;
    const victimMatches = victim.matchesPlayed || 0;
    
    // Conservative settings for new players
    const isNewPlayer = killerMatches < 10 || victimMatches < 10;
    const tau = isNewPlayer ? 0.3 : 0.5;

    const glicko = new Glicko2.Glicko2({
        tau: tau,
        rating: 1200,
        rd: 350,
        vol: 0.06
    });

    const p1 = glicko.makePlayer(killer.dojo_elo_api, killer.dojo_rd_api, killer.dojo_vol_api);
    const p2 = glicko.makePlayer(victim.dojo_elo_api, victim.dojo_rd_api, victim.dojo_vol_api);

    glicko.updateRatings([
        [p1, p2, killerResult],
        [p2, p1, 1 - killerResult]
    ]);

    // Additional scaling for extra conservatism
    const scaleRatingChange = (player, newRating, matches) => {
        if (matches < 10) {
            const scalingFactor = 0.5; // Additional 50% reduction on top of tau adjustment
            const originalRating = player.dojo_elo_api;
            const change = newRating - originalRating;
            const scaledChange = Math.round(change * scalingFactor);
            return originalRating + scaledChange;
        }
        return newRating;
    };

    return {
        killer: {
            dojo_elo_api: scaleRatingChange(killer, Math.round(p1.getRating()), killerMatches),
            dojo_rd_api: p1.getRd(),
            dojo_vol_api: p1.getVol()
        },
        victim: {
            dojo_elo_api: scaleRatingChange(victim, Math.round(p2.getRating()), victimMatches),
            dojo_rd_api: p2.getRd(),
            dojo_vol_api: p2.getVol()
        }
    };
}

module.exports = { updateGlicko2Api };