const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÃO ---
const MP_TOKEN = "APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741".trim();
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";
const SENHA_ADMIN = "123456"; 

mongoose.connect(MONGO_URI).then(() => console.log("✅ SISTEMA CONECTADO"));

// --- MODELOS ---
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    email: { type: String, unique: true },
    pass: String,
    saldo: { type: Number, default: 0.00 },
    ganhos: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] } // Array das 10 cores
}));

const Saque = mongoose.models.Saque || mongoose.model('Saque', new mongoose.Schema({
    user: String, valor: Number, chavePix: String, status: { type: String, default: 'Pendente' }, data: { type: Date, default: Date.now }
}));

// --- TIMER GLOBAL (2 MINUTOS FIXOS) ---
let t = 120;
setInterval(() => { 
    if(t > 0) t--; 
    else t = 120; 
}, 1000);

app.get('/api/tempo-real', (req, res) => res.json({ segundos: t }));

// --- LOGIN: RECUPERA AS APOSTAS ATUAIS DO BANCO ---
app.post('/auth/login', async (req, res) => {
    try {
        const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
        if (c) {
            // Enviamos as 'bets' de volta para o HTML saber o que já foi marcado
            res.json({ success: true, user: c.user, saldo: c.saldo, ganhos: c.ganhos, bets: c.bets });
        } else {
            res.json({ success: false, message: "Dados incorretos" });
        }
    } catch (e) { res.json({ success: false }); }
});

// --- SALVAR APOSTA: CHAME ISSO NO HTML SEMPRE QUE CLICAR NA COR ---
app.post('/api/save-saldo', async (req, res) => {
    try {
        const { user, saldo, bets } = req.body;
        // Atualiza o saldo e as cores marcadas no banco de dados
        await User.findOneAndUpdate({ user }, { saldo, bets });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// --- SPIN: SÓ AQUI O SORTEIO ACONTECE E AS CORES SÃO RESETADAS ---
app.post('/api/spin', async (req, res) => {
    try {
        const u = await User.findOne({ user: req.body.user });
        if(!u) return res.json({ success: false });

        let menor = Math.min(...u.bets), cores = [];
        u.bets.forEach((v, i) => { if(v === menor) cores.push(i); });
        const alvo = cores[Math.floor(Math.random() * cores.length)];
        const ganho = u.bets[alvo] * 5;
        const nS = Number((u.saldo + ganho).toFixed(2));
        const nG = Number((u.ganhos + ganho).toFixed(2));

        // Zera as apostas (bets) apenas neste momento (fim dos 2 min)
        await User.findOneAndUpdate(
            { user: req.body.user }, 
            { saldo: nS, ganhos: nG, bets: [0,0,0,0,0,0,0,0,0,0] }
        );

        res.json({ success: true, corAlvo: alvo, novoSaldo: nS, novoGanhos: nG });
    } catch (e) { res.json({ success: false }); }
});

// --- MERCADO PAGO QR CODE ---
app.post('/gerar-pix', (req, res) => {
    const { valor, userLogado } = req.body;
    const cleanUser = String(userLogado || "user").replace(/[^a-zA-Z0-9]/g, '');
    const postData = JSON.stringify({
        transaction_amount: Number(valor),
        description: `Dep_${cleanUser}`,
        payment_method_id: "pix",
        payer: {
            email: `${cleanUser}@gmail.com`,
            first_name: cleanUser,
            last_name: "Cliente",
            identification: { type: "CPF", number: "19119119100" }
        }
    });
    const options = {
        hostname: 'api.mercadopago.com', path: '/v1/payments', method: 'POST',
        headers: { 'Authorization': `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': 'k' + Date.now() }
    };
    const mpReq = https.request(options, (mpRes) => {
        let b = ''; mpRes.on('data', d => b += d);
        mpRes.on('end', () => {
            try {
                const r = JSON.parse(b);
                res.json({ success: true, imagem_qr: r.point_of_interaction.transaction_data.qr_code_base64, copia_e_cola: r.point_of_interaction.transaction_data.qr_code });
            } catch (e) { res.json({ success: false }); }
        });
    });
    mpReq.write(postData); mpReq.end();
});

// --- ADMIN ---
app.post('/admin/users', async (req, res) => {
    const { senha } = req.body;
    if (senha !== SENHA_ADMIN) return res.json({ success: false });
    const users = await User.find({});
    const saques = await Saque.find({ status: 'Pendente' });
    res.json({ success: true, users, saques });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("🚀 Servidor SlotReal Rodando"));
