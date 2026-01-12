const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const fetch = require('node-fetch'); // Certifique-se de ter o node-fetch instalado

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI);

const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    saldo: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] }
}));

const MP_TOKEN = "APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741".trim();

app.post('/gerar-pix', async (req, res) => {
    try {
        const { valor, userLogado } = req.body;

        const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${MP_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                transaction_amount: Number(valor),
                description: `Depósito - ${userLogado}`,
                payment_method_id: "pix",
                payer: { email: `${userLogado}@gmail.com` }
            })
        });

        const data = await mpRes.json();

        // Se o MP responder erro, a gente avisa aqui
        if (data.status === 400 || data.status === 401) {
            console.log("Erro MP:", data);
            return res.json({ success: false, message: data.message });
        }

        res.json({
            success: true,
            imagem_qr: data.point_of_interaction.transaction_data.qr_code_base64,
            copia_e_cola: data.point_of_interaction.transaction_data.qr_code
        });

    } catch (e) {
        console.error(e);
        res.json({ success: false });
    }
});

// Mantive as outras rotas (auth, save-saldo, spin) igual você já tem...
app.post('/auth/login', async (req, res) => {
    const conta = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (conta) res.json({ success: true, saldo: conta.saldo, user: conta.user, bets: conta.bets });
    else res.json({ success: false });
});

app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo, bets: req.body.bets });
    res.json({ success: true });
});

app.post('/api/spin', async (req, res) => {
    const userDb = await User.findOne({ user: req.body.user });
    let asApostas = userDb.bets;
    let menor = Math.min(...asApostas);
    let cores = [];
    asApostas.forEach((v, i) => { if(v === menor) cores.push(i); });
    const alvo = cores[Math.floor(Math.random() * cores.length)];
    const premio = asApostas[alvo] * 5.0;
    const novoSaldo = Number((userDb.saldo + premio).toFixed(2));
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: novoSaldo, bets: [0,0,0,0,0,0,0,0,0,0] });
    res.json({ success: true, corAlvo: alvo, novoSaldo });
});

app.get('/api/tempo-real', (req, res) => res.json({ segundos: 120 }));

app.listen(10000, () => console.log("🚀 Servidor rodando sem frescura"));
