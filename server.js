const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const https = require('https'); // Nativo do Node, não precisa instalar nada

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÃO ---
const MP_TOKEN = "APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741".trim();
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI).then(() => console.log("✅ MONGO CONECTADO"));

const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    saldo: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] }
}));

// --- ROTA PIX SEM BIBLIOTECA (DIRETO NA API DO MP) ---
app.post('/gerar-pix', (req, res) => {
    const { valor, userLogado } = req.body;

    const data = JSON.stringify({
        transaction_amount: Number(valor),
        description: `Deposito Slot - ${userLogado}`,
        payment_method_id: "pix",
        payer: { email: `${userLogado}@gmail.com` }
    });

    const options = {
        hostname: 'api.mercadopago.com',
        path: '/v1/payments',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${MP_TOKEN}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': Date.now().toString() // Exigido pelo Mercado Pago
        }
    };

    const mpReq = https.request(options, (mpRes) => {
        let responseBody = '';
        mpRes.on('data', (chunk) => responseBody += chunk);
        mpRes.on('end', () => {
            const d = JSON.parse(responseBody);
            if (d.point_of_interaction) {
                res.json({
                    success: true,
                    imagem_qr: d.point_of_interaction.transaction_data.qr_code_base64,
                    copia_e_cola: d.point_of_interaction.transaction_data.qr_code
                });
            } else {
                console.error("ERRO MP:", d);
                res.json({ success: false, message: d.message });
            }
        });
    });

    mpReq.on('error', (err) => {
        console.error("ERRO REQUISIÇÃO:", err);
        res.json({ success: false });
    });

    mpReq.write(data);
    mpReq.end();
});

// --- RESTO DAS ROTAS (LOGIN, SPIN, ETC) ---
app.post('/auth/login', async (req, res) => {
    const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (c) res.json({ success: true, saldo: c.saldo, user: c.user, bets: c.bets });
    else res.json({ success: false });
});

app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo, bets: req.body.bets });
    res.json({ success: true });
});

app.post('/api/spin', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    let menor = Math.min(...u.bets), cores = [];
    u.bets.forEach((v, i) => { if(v === menor) cores.push(i); });
    const alvo = cores[Math.floor(Math.random() * cores.length)];
    const novo = Number((u.saldo + (u.bets[alvo] * 5)).toFixed(2));
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: novo, bets: [0,0,0,0,0,0,0,0,0,0] });
    res.json({ success: true, corAlvo: alvo, novoSaldo: novo });
});

let tempo = 120;
setInterval(() => { if(tempo > 0) tempo--; else tempo = 120; }, 1000);
app.get('/api/tempo-real', (req, res) => res.json({ segundos: tempo }));

app.listen(10000, () => console.log("🚀 SERVIDOR VOANDO"));
