const express = require('express');
const autocatch = require('../misc/asyncautocatch');
const { query, getClient } = require('../dbcontrol/index');
const model_calculations = require('../models/model_calculations');
const { build_buildings, query_resources, get_building, pay_in_resources, lock_building, unlock_building, alter_building_level } = require('../routes/query_strings/auth_qs.json');
const router = express.Router();
//NO AUTOCATCH FOR TRANSACTIONS
router.post('/object', async (req, res, next) => {
    const { id, type, tier, level } = req.body;
    const { resources_needed: { A_Cost, B_Cost, C_Cost }, time_needed, name } = model_calculations(type, tier, level);
    const { rows: [row] } = await query(query_resources, [id]);
    const { rows: [row_existing] } = await query(get_building, [id]);

    if (row_existing && row_existing.level >= level)
        res.send('Already built');

    else {
        //Technical requirements check TBD, Level requirements check too
        if (row.resource_a >= A_Cost && row.resource_b >= B_Cost && row.resource_c >= C_Cost) {
            const client = getClient();
            await client.connect();
            await client.query(lock_building, [id]);
            if (row_existing.name!==undefined) {
                try{
                setTimeout(async () => {
                    await client.query('BEGIN');
                        await client.query(pay_in_resources, [A_Cost, B_Cost, C_Cost, id]);
                        await client.query(alter_building_level, [level,id,name]);
                        await client.query(unlock_building, [id]);
                        await client.query('COMMIT');
                        await client.end();
                },time_needed);
                    res.status(200).send(`Building upgrade scheduled, TBD: ${time_needed/1000}s`);
            }
                catch(exc){
                    console.log('encountered an error');
                    await client.query('ROLLBACK');
                    await client.query(unlock_building, [id]);
                    await client.end();
                    next(exc);
                }
            }
            else {
                try {                  
                    setTimeout(async () => {
                        //START TRANS

                        await client.query('BEGIN');
                        await client.query(pay_in_resources, [A_Cost, B_Cost, C_Cost, id]);
                        await client.query(build_buildings, [id, name, level]);
                        await client.query(unlock_building, [id]);
                        await client.query('COMMIT');
                        await client.end();

                    }, time_needed);

                    res.status(200).send(`Building scheduled, TBD: ${time_needed/1000}s`);
                }
                catch (exc) {
                    console.log('encountered an error');
                    await client.query('ROLLBACK');
                    await client.query(unlock_building, [id]);
                    await client.end();
                    next(exc);
                }
            }
        }
        else {
            res.send('Insufficient resources');
        }
    }
});

module.exports = router;