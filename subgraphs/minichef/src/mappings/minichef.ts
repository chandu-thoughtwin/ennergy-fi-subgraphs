import { ACC_SUSHI_PRECISION, ADDRESS_ZERO, BIG_INT_ONE, BIG_INT_ZERO } from 'const'
import {
  Deposit,
  EmergencyWithdraw,
  Harvest,
  LogPoolAddition,
  LogSetPool,
  LogEnergyFiPerSecond,
  LogUpdatePool,
  Withdraw,
} from '../../generated/MiniChef/MiniChef'
import { getMiniChef, getPool, getRewarder, getUser } from '../entities'

import { log } from '@graphprotocol/graph-ts'

export function logPoolAddition(event: LogPoolAddition): void {
  /*log.info('[MiniChef] Log Pool Addition {} {} {} {}', [
    event.params.pid.toString(),
    event.params.allocPoint.toString(),
    event.params.lpToken.toHex(),
    event.params.rewarder.toHex(),
  ])*/

  const miniChef = getMiniChef(event.block)
  const pool = getPool(event.params.pid, event.block)

  const rewarder = getRewarder(event.params.rewarder, event.block)
  pool.rewarder = rewarder.id
  pool.pair = event.params.lpToken
  pool.allocPoint = event.params.allocPoint
  pool.save()

  miniChef.totalAllocPoint = miniChef.totalAllocPoint.plus(pool.allocPoint)
  miniChef.poolCount = miniChef.poolCount.plus(BIG_INT_ONE)
  miniChef.save()
}

export function logSetPool(event: LogSetPool): void {
  /*log.info('[MiniChef] Log Set Pool {} {} {} {}', [
    event.params.pid.toString(),
    event.params.allocPoint.toString(),
    event.params.rewarder.toHex(),
    event.params.overwrite == true ? 'true' : 'false',
  ])*/

  const miniChef = getMiniChef(event.block)
  const pool = getPool(event.params.pid, event.block)

  if (event.params.overwrite == true) {
    const rewarder = getRewarder(event.params.rewarder, event.block)
    pool.rewarder = rewarder.id
  }

  miniChef.totalAllocPoint = miniChef.totalAllocPoint.plus(event.params.allocPoint.minus(pool.allocPoint))
  miniChef.save()
  pool.allocPoint = event.params.allocPoint
  pool.save()
}

export function logUpdatePool(event: LogUpdatePool): void {
  /*log.info('[MiniChef] Log Update Pool {} {} {} {}', [
    event.params.pid.toString(),
    event.params.lastRewardTime.toString(), //uint64, I think this is Decimal but not sure
    event.params.lpSupply.toString(),
    event.params.accEnergyFiPerShare.toString(),
  ])*/
  const pool = getPool(event.params.pid, event.block)
  pool.accEnergyFiPerShare = event.params.accEnergyFiPerShare
  pool.lastRewardTime = event.params.lastRewardTime
  pool.save()
}

export function logEnergyFiPerSecond(event: LogEnergyFiPerSecond): void {
  //log.info('[MiniChef] Log EnergyFi Per Second {}', [event.params.energyFiPerSecond.toString()])

  const miniChef = getMiniChef(event.block)

  miniChef.energyFiPerSecond = event.params.energyFiPerSecond
  miniChef.save()
}

export function deposit(event: Deposit): void {
  /*log.info('[MiniChef] Log Deposit {} {} {} {}', [
    event.params.user.toHex(),
    event.params.pid.toString(),
    event.params.amount.toString(),
    event.params.to.toHex(),
  ])*/
  const pool = getPool(event.params.pid, event.block)
  const user = getUser(event.params.to, event.params.pid, event.block)

  pool.slpBalance = pool.slpBalance.plus(event.params.amount)
  pool.save()

  user.amount = user.amount.plus(event.params.amount)
  user.rewardDebt = user.rewardDebt.plus(event.params.amount.times(pool.accEnergyFiPerShare).div(ACC_SUSHI_PRECISION))
  user.save()
}

export function withdraw(event: Withdraw): void {
  /*log.info('[MiniChef] Log Withdraw {} {} {} {}', [
    event.params.user.toHex(),
    event.params.pid.toString(),
    event.params.amount.toString(),
    event.params.to.toHex(),
  ])*/

  const pool = getPool(event.params.pid, event.block)
  const user = getUser(event.params.user, event.params.pid, event.block)

  pool.slpBalance = pool.slpBalance.minus(event.params.amount)
  pool.save()

  user.amount = user.amount.minus(event.params.amount)
  user.rewardDebt = user.rewardDebt.minus(event.params.amount.times(pool.accEnergyFiPerShare).div(ACC_SUSHI_PRECISION))
  user.save()
}

export function emergencyWithdraw(event: EmergencyWithdraw): void {
  /*log.info('[MiniChef] Log Emergency Withdraw {} {} {} {}', [
    event.params.user.toHex(),
    event.params.pid.toString(),
    event.params.amount.toString(),
    event.params.to.toHex(),
  ])*/

  const pool = getPool(event.params.pid, event.block)
  const user = getUser(event.params.user, event.params.pid, event.block)

  pool.slpBalance = pool.slpBalance.minus(event.params.amount)
  pool.save()

  user.amount = BIG_INT_ZERO
  user.rewardDebt = BIG_INT_ZERO
  user.save()
}

export function harvest(event: Harvest): void {
  /*log.info('[MiniChef] Log Withdraw {} {} {}', [
    event.params.user.toHex(),
    event.params.pid.toString(),
    event.params.amount.toString(),
  ])*/

  const pool = getPool(event.params.pid, event.block)
  const user = getUser(event.params.user, event.params.pid, event.block)

  const accumulatedEnergyFi = user.amount.times(pool.accEnergyFiPerShare).div(ACC_SUSHI_PRECISION)

  user.rewardDebt = accumulatedEnergyFi
  user.energyFiHarvested = user.energyFiHarvested.plus(event.params.amount)
  user.save()
}
