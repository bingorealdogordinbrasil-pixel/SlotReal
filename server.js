const express = require('express');
const mongoose = require('mongoose');
const app = express();
app.use(express.json());
app.use(express.static('public'));

mongoose.connect("mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority");

const User = mongoose.model('User', new mongoose.Schema({
    user: String, pass: String, saldo: { type: Number, default: 0 }, bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] }
}));

let t = 30; 
setInterval(() => { if(t > 0) t--; else t = 30; }, 1000);
app.get('/api/tempo-real', (req, res) => res.json({ segundos: t }));

app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo, bets: req.body.bets });
    res.json({ success: true });
});

app.post('/api/spin', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    let menorAposta = Math.min(...u.bets);
    let opcoes = [];
    u.bets.forEach((v, i) => { if(v === menorAposta) opcoes.push(i); });
    const alvo = opcoes[Math.floor(Math.random() * opcoes.length)];
    
    const ganho = u.bets[alvo] * 5; // Paga 5x o valor apostado
    const novoSaldo = u.saldo + ganho;
    await User.findOneAndUpdate({ user: u.user }, { $set: { saldo: novoSaldo, bets: [0,0,0,0,0,0,0,0,0,0] } });
    res.json({ success: true, corAlvo: alvo, novoSaldo: novoSaldo, valorGanho: ganho });
});
app.listen(10000);
